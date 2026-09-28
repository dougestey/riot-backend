import { requireUser } from '@/lib/auth'
import { facebookEventsFeatureStatus, runFacebookFeasibilityProbe } from '@/lib/facebook-events'

export async function GET() {
  return Response.json(facebookEventsFeatureStatus())
}

export async function POST(request: Request) {
  try {
    await requireUser(request, ['admin'])
    const result = await runFacebookFeasibilityProbe()
    return Response.json(result, { status: result.success ? 200 : 424 })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Facebook feasibility probe failed' },
      { status: 400 },
    )
  }
}
