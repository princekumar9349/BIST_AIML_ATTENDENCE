import "./globals.css";

export const metadata = {
  title: "AIML Attendance | BIST Bhopal & BGI",
  description: "Department of AIML attendance management system",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AIML Attendance",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a192f",
};

export default function RootLayout({ children }) {
  return <html lang="en"><head><link rel="preconnect" href="https://script.google.com" /><link rel="preconnect" href="https://script.googleusercontent.com" /></head><body>{children}</body></html>;
}
