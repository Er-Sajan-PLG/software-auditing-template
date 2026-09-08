# Contributing to Software Auditing Template

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Create a new branch for your feature or fix
4. Make your changes
5. Run tests and linting
6. Submit a Pull Request

## Development Setup

### Node.js

```bash
npm install
npm run lint
npm test
```

### Python

```bash
pip install -e ".[dev]"
ruff check .
pytest
```

## Branch Naming

- Feature branches: `feat/description`
- Bug fix branches: `fix/description`
- Documentation branches: `docs/description`
- Refactoring branches: `refactor/description`

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

## Pull Request Process

1. Ensure your branch is up to date with `main`
2. Run all tests and linting
3. Fill out the PR template
4. Request review from maintainers
5. Address any feedback
6. Merge after approval

## Code Style

- Follow the existing code style in the project
- Use TypeScript for new TypeScript files
- Use type hints for new Python files
- Write tests for new functionality

## Reporting Issues

Please use the GitHub issue tracker to report bugs or request features.