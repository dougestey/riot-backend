'use client'

import SwaggerUI from 'swagger-ui-react'
import 'swagger-ui-react/swagger-ui.css'

export default function SwaggerUIClient() {
  return (
    <SwaggerUI
      url="/api/docs/openapi.json"
      docExpansion="none"
      defaultModelExpandDepth={1}
      defaultModelsExpandDepth={1}
    />
  )
}
