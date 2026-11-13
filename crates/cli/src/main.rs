use std::process::ExitCode;

use clap::{Parser, Subcommand};
use endpoint_lab_core::{
    parse_method, run_benchmark, BenchConfig, CancellationToken, HeaderEntry, HttpExecutor,
    HttpRequest, QueryParam, RequestBody, ResponseBody,
};
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(
    name = "endpoint-lab",
    about = "Send HTTP requests and run localhost benchmarks with the Endpoint Lab engine"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Send one HTTP request.
    Send {
        #[arg(long, default_value = "GET")]
        method: String,
        #[arg(long)]
        url: String,
        /// Repeatable `Name: Value` header.
        #[arg(long = "header")]
        headers: Vec<String>,
        /// Repeatable `name=value` query parameter.
        #[arg(long = "query")]
        query: Vec<String>,
        #[arg(long)]
        body: Option<String>,
        /// Interpret `--body` as JSON and set the content type when absent.
        #[arg(long, default_value_t = false)]
        json: bool,
        #[arg(long, default_value_t = 30_000)]
        timeout_ms: u64,
    },
    /// Run a bounded load test. Non-loopback hosts require `--authorize-remote`.
    Bench {
        #[arg(long, default_value = "GET")]
        method: String,
        #[arg(long)]
        url: String,
        #[arg(long = "header")]
        headers: Vec<String>,
        #[arg(long = "query")]
        query: Vec<String>,
        #[arg(long)]
        body: Option<String>,
        #[arg(long, default_value_t = false)]
        json: bool,
        #[arg(long, default_value_t = 100)]
        requests: u64,
        #[arg(long, default_value_t = 10)]
        concurrency: usize,
        #[arg(long)]
        duration_ms: Option<u64>,
        #[arg(long, default_value_t = 10_000)]
        timeout_ms: u64,
        #[arg(long, default_value_t = 0)]
        warmup: u64,
        /// Required for any host that is not loopback.
        #[arg(long, default_value_t = false)]
        authorize_remote: bool,
    },
}

#[tokio::main]
async fn main() -> ExitCode {
    init_tracing();
    match run(Cli::parse()).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("error: {err}");
            ExitCode::from(1)
        }
    }
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("warn,endpoint_lab_core=info,endpoint_lab_cli=info"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .try_init();
}

async fn run(cli: Cli) -> Result<(), endpoint_lab_core::Error> {
    let executor = HttpExecutor::new()?;
    match cli.command {
        Command::Send {
            method,
            url,
            headers,
            query,
            body,
            json,
            timeout_ms,
        } => {
            let request = build_request(method, url, headers, query, body, json, timeout_ms)?;
            let response = executor.execute(&request, &CancellationToken::new()).await?;
            print_response(&response);
            Ok(())
        }
        Command::Bench {
            method,
            url,
            headers,
            query,
            body,
            json,
            requests,
            concurrency,
            duration_ms,
            timeout_ms,
            warmup,
            authorize_remote,
        } => {
            let request = build_request(method, url, headers, query, body, json, timeout_ms)?;
            let config = BenchConfig {
                request,
                total_requests: requests,
                concurrency,
                duration_ms,
                timeout_ms,
                warmup_requests: warmup,
                authorize_remote,
            };
            let cancel = CancellationToken::new();
            let signal = cancel.clone();
            tokio::spawn(async move {
                if tokio::signal::ctrl_c().await.is_ok() {
                    signal.cancel();
                }
            });
            let summary = run_benchmark(&executor, config, &cancel, |snapshot| {
                eprint!(
                    "\r{:<8} {:>6} done  {:>6.1} rps  errors {}",
                    snapshot.phase,
                    snapshot.total,
                    snapshot.rps,
                    snapshot.http_errors + snapshot.transport_errors
                );
            })
            .await?;
            eprintln!();
            print_summary(&summary);
            Ok(())
        }
    }
}

fn build_request(
    method: String,
    url: String,
    headers: Vec<String>,
    query: Vec<String>,
    body: Option<String>,
    json: bool,
    timeout_ms: u64,
) -> Result<HttpRequest, endpoint_lab_core::Error> {
    let body = match body {
        Some(value) if json => RequestBody::Json { value },
        Some(value) => RequestBody::Text { value },
        None => RequestBody::None,
    };
    Ok(HttpRequest {
        method: parse_method(&method)?,
        url,
        headers: headers.iter().map(|line| parse_header(line)).collect::<Result<_, _>>()?,
        query: query.iter().map(|line| parse_query(line)).collect::<Result<_, _>>()?,
        body,
        timeout_ms,
        url_secret_refs: Vec::new(),
    })
}

fn parse_header(line: &str) -> Result<HeaderEntry, endpoint_lab_core::Error> {
    let Some((name, value)) = line.split_once(':') else {
        return Err(endpoint_lab_core::Error::InvalidConfig(format!(
            "header '{line}' must be Name: Value"
        )));
    };
    Ok(HeaderEntry {
        name: name.trim().to_string(),
        value: value.trim().to_string(),
        enabled: true,
        secret: false,
        secret_ref: None,
    })
}

fn parse_query(line: &str) -> Result<QueryParam, endpoint_lab_core::Error> {
    let Some((name, value)) = line.split_once('=') else {
        return Err(endpoint_lab_core::Error::InvalidConfig(format!(
            "query '{line}' must be name=value"
        )));
    };
    Ok(QueryParam {
        name: name.trim().to_string(),
        value: value.trim().to_string(),
        enabled: true,
        secret: false,
        secret_ref: None,
    })
}

fn print_response(response: &endpoint_lab_core::HttpResponse) {
    println!(
        "HTTP {} {}",
        response.status, response.status_text
    );
    println!("elapsed: {} ms", response.elapsed_ms);
    let exact = if response.size_exact { "" } else { "at least " };
    println!("size: {exact}{} bytes", response.size_bytes);
    if response.truncated {
        println!("body: truncated preview");
    }
    println!();
    for header in &response.headers {
        println!("{}: {}", header.name, header.value);
    }
    println!();
    match &response.body {
        ResponseBody::Empty => {}
        ResponseBody::Text { content, .. } => println!("{content}"),
        ResponseBody::Binary { message } => println!("{message}"),
    }
}

fn print_summary(summary: &endpoint_lab_core::BenchSummary) {
    println!("{} {}", summary.method, summary.url);
    println!("elapsed: {} ms", summary.elapsed_ms);
    println!(
        "requests: {}  success: {}  http errors: {}  transport errors: {}",
        summary.total, summary.success, summary.http_errors, summary.transport_errors
    );
    println!("cancelled attempts: {}", summary.cancelled_attempts);
    println!("cancelled: {}", summary.cancelled);
    println!("rps: {:.2}", summary.rps);
    println!("bytes: {}", summary.bytes);
    let latency = &summary.latency;
    println!(
        "latency us  mean {}  min {}  p50 {}  p90 {}  p95 {}  p99 {}  max {}",
        latency.mean_us,
        latency.min_us,
        latency.p50_us,
        latency.p90_us,
        latency.p95_us,
        latency.p99_us,
        latency.max_us
    );
    if !summary.errors.is_empty() {
        println!("errors:");
        for error in &summary.errors {
            println!("  {}: {}", error.cause, error.count);
        }
    }
}
