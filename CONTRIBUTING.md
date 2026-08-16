# Contributing to CFCompanion

First off, thank you for considering contributing to CFCompanion! We welcome contributions of all forms, including bug reports, feature requests, documentation improvements, and code changes.

## How to Contribute

### 1. Reporting Bugs
- Search the issue tracker to ensure the bug hasn't already been reported.
- If it's a new issue, use the **Bug Report** template to submit a report.
- Include a clear description, reproduction steps, and any relevant error logs or screenshots.

### 2. Suggesting Enhancements
- Check the issue tracker for similar feature requests.
- Use the **Feature Request** template to submit a proposal.
- Explain why the feature is valuable and how it should work.

### 3. Submitting Code Changes (Pull Requests)
1. Fork the repository and create your branch from `main`.
2. Install dependencies:
   ```bash
   npm install
   npm run install:all
   ```
3. Set up your local database and run the application.
4. Make your changes and ensure they adhere to coding standards.
5. Format and lint your code:
   ```bash
   npm run format
   npm run lint
   ```
6. Commit your changes with clear, descriptive commit messages.
7. Push your branch to GitHub and submit a Pull Request to the `main` branch.

## Code Style & Guidelines

- **Linting & Formatting**: We use ESLint and Prettier. Run `npm run format` to clean up your code before committing.
- **Database Migrations**: If your change modifies the database schema, make sure to update `backend/prisma/schema.prisma` and generate the Prisma Client using `npm run db:generate`.
- **Git Commits**: Follow standard semantic commit guidelines where applicable (e.g., `feat: add progressive hints`, `fix: handle cors errors`).
