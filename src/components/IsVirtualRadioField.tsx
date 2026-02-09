'use client'

import { useField } from '@payloadcms/ui'
import type { CheckboxFieldClientComponent } from 'payload'

export const IsVirtualRadioField: CheckboxFieldClientComponent = ({ path, field }) => {
  const { value, setValue } = useField<boolean>({ path })

  const isVirtual = value === true

  return (
    <div
      style={{
        display: 'inline-flex',
        position: 'relative',
        backgroundColor: 'var(--theme-elevation-200)',
        borderRadius: '9999px',
        padding: '4px',
        gap: '0',
        border: '1px solid var(--theme-border-color)',
        marginBottom: '20px',
      }}
    >
      <button
        type="button"
        onClick={() => setValue(false)}
        style={{
          padding: '8px 20px',
          borderRadius: '9999px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          transition: 'all 0.2s ease',
          backgroundColor: !isVirtual ? 'var(--theme-elevation-0)' : 'transparent',
          color: !isVirtual ? 'var(--theme-text)' : 'var(--theme-elevation-400)',
          boxShadow: !isVirtual ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
          outline: 'none',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          if (isVirtual) {
            e.currentTarget.style.backgroundColor = 'var(--theme-elevation-100)'
          }
        }}
        onMouseLeave={(e) => {
          if (isVirtual) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        In-person
      </button>
      <button
        type="button"
        onClick={() => setValue(true)}
        style={{
          padding: '8px 20px',
          borderRadius: '9999px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          transition: 'all 0.2s ease',
          backgroundColor: isVirtual ? 'var(--theme-elevation-0)' : 'transparent',
          color: isVirtual ? 'var(--theme-text)' : 'var(--theme-elevation-400)',
          boxShadow: isVirtual ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
          outline: 'none',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          if (!isVirtual) {
            e.currentTarget.style.backgroundColor = 'var(--theme-elevation-100)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isVirtual) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        Virtual
      </button>
    </div>
  )
}

export default IsVirtualRadioField
