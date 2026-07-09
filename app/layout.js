import "./globals.css";

export const metadata = {
  title: "SACA - System ADB Cleaner Assistant",
  description: "Interactive Web app to list and uninstall Android packages via ADB",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
