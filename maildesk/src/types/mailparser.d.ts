declare module 'mailparser' {
  export interface MailAddress {
    name: string | undefined
    value: Array<{ text: string }>
  }

  export interface ParsedMail {
    subject: string | undefined
    from: MailAddress | undefined
    to: MailAddress | undefined
    cc: MailAddress | undefined
    date: Date | undefined
    html: string | undefined
    text: string | undefined
    textAsHtml: string | undefined
    headers: Map<string, string>
    header: {
      get: (key: string) => string | undefined
    }
    attachments: Array<{
      filename: string
      contentType: string
      content: Buffer
      cid: string
    }>
  }

  export function simpleParser(
    source: string | Buffer | NodeJS.ReadableStream,
    options?: Record<string, unknown>
  ): Promise<ParsedMail>
}
