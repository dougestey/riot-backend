'use client'

import dynamic from 'next/dynamic'

const SwaggerUIClient = dynamic(() => import('./SwaggerUIClient'), {
  ssr: false,
})

export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <section className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">API Reference</h1>
          <p className="mt-2 text-sm text-slate-300">
            OpenAPI-powered documentation for the Riot Events REST API.
          </p>
        </header>
        <div className="overflow-hidden rounded-lg bg-slate-900">
          <SwaggerUIClient />
        </div>
      </section>
    </main>
  )
}
