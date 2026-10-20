# Rhyza documentation

This repo is the code behind [docs.rhyza.dev](https://docs.rhyza.dev), our documentation website for Rhyza.

The website is built with [Starlight](https://starlight.astro.build/), a documentation framework based on [Astro](https://astro.build/).

## Local Development

- Make sure all the dependencies for the website are installed. Because this is a monorepo, you should run the following command in the root of the project folder:

```sh
$ pnpm i
```

- Run the dev server from the `/docs` folder:

```sh
$ pnpm start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

- Build the site, again, this must be run from the `/docs` folder:

```sh
$ pnpm build
```

This command generates static content into the build directory. You can preview the build locally using:

```sh
$ pnpm preview
```

### Formatting and Linting

The documentation uses [Prettier](https://prettier.io/) for formatting and [ESLint](https://eslint.org/) for linting. This package has its own Prettier configuration (`.prettierrc`) that differs from the root repository configuration, and is excluded from root-level formatting via `.prettierignore`.

From the root of the repository, you can run:

```sh
# Format documentation files
$ pnpm --filter docs format

# Lint documentation files
$ pnpm --filter docs lint
```

Or from within this package directory:

```sh
cd docs
pnpm format
```

## Editing Content

Starlight looks for `.md` or `.mdx` files in the `src/content/docs/` directory. Each file is exposed as a route based on its file name. Due to the nature of how Starlight deals with content and their generated URLs, all docs content lives in `/src/content/docs/`. For example, the home page of the documentation lives within the `/src/content/docs/` folder and is rendered at docs.rhyza.dev, not docs.rhyza.dev/docs.

Static assets, like favicons or images, can be placed in the `public/` directory.

### MDX Syntax Requirements

When using directive blocks (like `:::note`, `:::tip`, `:::warning`, `:::danger`) inside component children (such as `<TabItem>`), **the directive must be at the root level (no indentation)**. This is a requirement for MDX parsing compatibility with Astro 5.17+.

## Troubleshooting

### Build fails with MDX directive errors

If you see an error like:

```
Expected the closing tag `</TabItem>` either after the end of `directiveContainer`
```

This means you have an indented directive block (like `:::note`) inside a component. See the [MDX Syntax Requirements](#mdx-syntax-requirements) section above for the correct syntax.
