import "./globals.css";

export const metadata = {
  title: "Training Attendance | BIST Bhopal & BGI",
  description: "Training attendance for the Training Head and trainers",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Training Attendance",
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
  themeColor: "#f6f7f9",
};

export default function RootLayout({ children }) {
  return <html lang="en"><head><link rel="preconnect" href="https://script.google.com" /><link rel="preconnect" href="https://script.googleusercontent.com" /></head><body>{children}</body></html>;
}
