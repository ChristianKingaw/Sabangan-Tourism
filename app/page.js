import fs from "node:fs";
import path from "node:path";
import Script from "next/script";
import GagayamTrailLeafletMount from "../components/GagayamTrailLeafletMount";
import RegistrationForm from "../components/RegistrationForm";

const sourceHtmlPath = path.join(process.cwd(), "public", "index.html");
const sourceHtml = fs.readFileSync(sourceHtmlPath, "utf8");
const bodyMatch = sourceHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
const fullBodyHtml = bodyMatch ? bodyMatch[1] : sourceHtml;
const legacyBodyHtml = fullBodyHtml.replace(/<script[\s\S]*?<\/script>/gi, "");

export default function HomePage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: legacyBodyHtml }} suppressHydrationWarning />
      <RegistrationForm />
      <GagayamTrailLeafletMount />
      <Script
        src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
        integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz"
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      <Script src="/js/app.js" strategy="afterInteractive" />
    </>
  );
}
