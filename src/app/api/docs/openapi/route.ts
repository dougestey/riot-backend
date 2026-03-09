import fs from 'node:fs/promises'
import path from 'node:path'

import { NextResponse } from 'next/server'
import { parse } from 'yaml'

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'docs', 'openapi.yaml')
    const file = await fs.readFile(filePath, 'utf8')
    const spec = parse(file)

    return NextResponse.json(spec)
  } catch (error) {
    console.error('Failed to read OpenAPI spec:', error)
    return NextResponse.json({ error: 'Failed to load OpenAPI spec' }, { status: 500 })
  }
}
