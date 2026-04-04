"use client"

import katex from "katex"

type RichTextItem = {
  plain_text?: string
  type?: string
  text?: {
    content?: string
  }
  equation?: {
    expression?: string
  }
}

type RichTextRendererProps = {
  items: RichTextItem[]
  className?: string
}

export function RichTextRenderer({ items, className }: RichTextRendererProps) {
  return (
    <span className={className}>
      {items.map((item, index) => {
        if (item.type === "equation" && item.equation?.expression) {
          const html = katex.renderToString(item.equation.expression, {
            displayMode: false,
            throwOnError: false,
          })

          return (
            <span
              key={`equation-${index}`}
              className="notion-equation"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )
        }

        return <span key={`text-${index}`}>{item.plain_text ?? item.text?.content ?? ""}</span>
      })}
    </span>
  )
}
