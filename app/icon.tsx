import { ImageResponse } from "next/og"

export const size = {
  width: 96,
  height: 96,
}

export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)",
          border: "3px solid #d1d5db",
          borderRadius: 26,
          color: "#111827",
          display: "flex",
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 32,
          fontWeight: 700,
          height: "100%",
          justifyContent: "center",
          letterSpacing: 0,
          width: "100%",
        }}
      >
        NQ
      </div>
    ),
    size,
  )
}
