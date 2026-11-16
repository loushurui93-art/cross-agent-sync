/**
 * Unified conversation model (guide §11.2). Sources keep their provenance
 * (external ids, source path, parser version) so re-imports dedupe and the
 * UI can always show where a message came from. Imported content is data,
 * never instructions.
 */

export const PARSER_VERSION = 'codex-zcode-v1'

export type NormalizedRole = 'user' | 'assistant' | 'tool' | 'system' | 'unknown'

export interface NormalizedPart {
  type: 'text' | 'tool-call' | 'tool-result'
  text?: string
  toolName?: string
  metadata?: Record<string, unknown>
}

export interface NormalizedMessage {
  externalId?: string
  role: NormalizedRole
  text?: string
  parts?: NormalizedPart[]
  /** epoch ms */
  timestamp?: number
  sequence: number
}

export interface NormalizedConversation {
  externalId: string
  title?: string
  sourcePath: string
  startedAt?: number
  messages: NormalizedMessage[]
}

export interface SourceSummary {
  externalId: string
  title: string
  sourcePath: string
  cwd: string
  updatedAt: number
}

export function messagePlainText(m: NormalizedMessage): string {
  if (m.text) return m.text
  return (m.parts ?? [])
    .map((p) => p.text ?? '')
    .filter(Boolean)
    .join('\n')
}
