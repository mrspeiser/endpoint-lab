# Contributing to Endpoint Lab

Thank you for your interest in contributing to Endpoint Lab! This document provides guidelines and instructions for contributing.

## Development Setup

See the [README.md](README.md) for detailed instructions on setting up your development environment.

### Quick Start

```bash
# Clone the repository
git clone https://github.com/mrspeiser/endpoint-lab.git
cd endpoint-lab

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

## Code Style

### TypeScript/React

- Use functional components with hooks
- Prefer `const` over `let` where possible
- Use TypeScript strict mode
- Run `npm run check` before committing

### Rust

- Follow Rust standard formatting (`cargo fmt`)
- Ensure code passes `cargo clippy`
- Write tests for new functionality
- Document public APIs

## Testing

### Frontend

```bash
npm run check
```

### Backend

```bash
cd src-tauri
cargo test --workspace
cargo clippy --workspace -- -D warnings
```

## Commit Messages

Follow conventional commit format:

- `feat: add new feature`
- `fix: resolve bug`
- `docs: update documentation`
- `style: code formatting`
- `refactor: code restructuring`
- `test: add or update tests`
- `chore: maintenance tasks`

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `master`
3. Make your changes
4. Run tests and linters
5. Commit your changes with clear messages
6. Push to your fork
7. Create a Pull Request

### PR Checklist

- [ ] Code passes all tests
- [ ] Code passes linting (`npm run check` and `cargo clippy`)
- [ ] Documentation is updated if needed
- [ ] Commit messages follow conventions
- [ ] PR description clearly explains the changes

## Reporting Issues

When reporting issues, please include:

- Operating system and version
- Endpoint Lab version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Relevant error messages or logs

## Feature Requests

Feature requests are welcome! Please:

- Check if the feature already exists or is planned
- Clearly describe the feature and its use case
- Explain why it would be valuable
- Consider creating a draft PR if you can implement it

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Respect differing viewpoints

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
