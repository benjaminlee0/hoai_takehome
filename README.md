## Features

- [Next.js](https://nextjs.org) App Router
  - Advanced routing for seamless navigation and performance
  - React Server Components (RSCs) and Server Actions for server-side rendering and increased performance
- [AI SDK](https://sdk.vercel.ai/docs)
  - Unified API for generating text, structured objects, and tool calls with LLMs
  - Hooks for building dynamic chat and generative user interfaces
  - Supports OpenAI (default), Anthropic, Cohere, and other model providers
- [shadcn/ui](https://ui.shadcn.com)
  - Styling with [Tailwind CSS](https://tailwindcss.com)
  - Component primitives from [Radix UI](https://radix-ui.com) for accessibility and flexibility

## Model Providers

This template uses OpenAI's GPT-4 model for invoice processing and analysis. You will need an OpenAI API key to run the application.

## Running locally

You will need to use the environment variables [defined in `.env.example`](.env.example) to run Next.js AI Chatbot. 

### Environment Setup

1. Copy `.env.example` to `.env.local`
2. Add your OpenAI API key to `.env.local`:
```bash
OPENAI_API_KEY=your_api_key_here
```

### Installation

```bash
# Install dependencies with legacy peer deps to handle React version conflicts
npm install --legacy-peer-deps

# Run database migrations
npm run db:migrate

# Start the development server
npm run dev
```

> **Note**: We use `patch-package` to fix an issue with the `pdf-parse` library. The patch will be automatically applied during the installation process via the `postinstall` script.

Your app template should now be running on [localhost:3000](http://localhost:3000/).
