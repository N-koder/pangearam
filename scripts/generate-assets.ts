import sharp from "sharp";
import fs from "fs";
import path from "path";

const assetsDir = path.resolve(__dirname, "../assets");
const artifactDir = "C:/Users/webwo/.gemini/antigravity/brain/b4c9061f-4ef6-4496-89f5-f705dd270fc0";

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 1. 512x512 Profile Picture (Botpic) SVG
const profileSvg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#070B14"/>
      <stop offset="50%" stop-color="#0E172A"/>
      <stop offset="100%" stop-color="#090D18"/>
    </linearGradient>
    <radialGradient id="glowCenter" cx="50%" cy="42%" r="50%">
      <stop offset="0%" stop-color="#627EEA" stop-opacity="0.38"/>
      <stop offset="55%" stop-color="#38BDF8" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#070B14" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ethLeft" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#93C5FD"/>
      <stop offset="100%" stop-color="#627EEA"/>
    </linearGradient>
    <linearGradient id="ethRight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#627EEA"/>
      <stop offset="100%" stop-color="#3B53B8"/>
    </linearGradient>
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="50%" stop-color="#627EEA"/>
      <stop offset="100%" stop-color="#A855F7"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="512" height="512" rx="96" fill="url(#bgGrad)"/>
  <circle cx="256" cy="220" r="230" fill="url(#glowCenter)"/>

  <!-- Subtle Tech Grid Rings -->
  <circle cx="256" cy="215" r="158" fill="none" stroke="url(#ringGrad)" stroke-width="2.5" stroke-opacity="0.45"/>
  <circle cx="256" cy="215" r="182" fill="none" stroke="#38BDF8" stroke-width="1" stroke-dasharray="6 8" stroke-opacity="0.3"/>

  <!-- 3 Protocol Orbit Nodes -->
  <circle cx="256" cy="57" r="9" fill="#38BDF8"/>
  <circle cx="119" cy="294" r="9" fill="#A855F7"/>
  <circle cx="393" cy="294" r="9" fill="#10B981"/>

  <!-- Central Hexagon Shield -->
  <polygon points="256,82 372,148 372,282 256,348 140,282 140,148" fill="#0D1526" stroke="url(#ringGrad)" stroke-width="3.5"/>

  <!-- Ethereum Crystal Emblem -->
  <!-- Top Left -->
  <polygon points="256,112 184,218 256,186" fill="url(#ethLeft)"/>
  <!-- Top Right -->
  <polygon points="256,112 328,218 256,186" fill="url(#ethRight)"/>
  <!-- Inner Left -->
  <polygon points="256,186 184,218 256,256" fill="#627EEA" opacity="0.9"/>
  <!-- Inner Right -->
  <polygon points="256,186 328,218 256,256" fill="#4358B5" opacity="0.95"/>
  <!-- Bottom Left -->
  <polygon points="256,272 184,232 256,320" fill="url(#ethLeft)"/>
  <!-- Bottom Right -->
  <polygon points="256,272 328,232 256,320" fill="url(#ethRight)"/>

  <!-- Typography Banner -->
  <text x="256" y="416" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="52" fill="#FFFFFF" text-anchor="middle" letter-spacing="6">TELETH</text>
  
  <!-- Pill Badge -->
  <rect x="136" y="438" width="240" height="34" rx="17" fill="#131E36" stroke="#38BDF8" stroke-width="1.5" stroke-opacity="0.5"/>
  <text x="256" y="460" font-family="Consolas, monospace" font-weight="700" font-size="15" fill="#38BDF8" text-anchor="middle" letter-spacing="2">ETHEREUM • V4</text>
</svg>
`;

// 2. Banner Builder Function (for both 600x360 and 640x360)
function buildBannerSvg(width: number, height: number): string {
  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#070A12"/>
      <stop offset="50%" stop-color="#0D1526"/>
      <stop offset="100%" stop-color="#080C16"/>
    </linearGradient>
    <radialGradient id="glowLeft" cx="22%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#627EEA" stop-opacity="0.32"/>
      <stop offset="60%" stop-color="#38BDF8" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#070A12" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="50%" stop-color="#627EEA"/>
      <stop offset="100%" stop-color="#A855F7"/>
    </linearGradient>
    <linearGradient id="ethL" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#93C5FD"/>
      <stop offset="100%" stop-color="#627EEA"/>
    </linearGradient>
    <linearGradient id="ethR" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#627EEA"/>
      <stop offset="100%" stop-color="#3B53B8"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glowLeft)"/>

  <!-- Border Frame -->
  <rect x="10" y="10" width="${width - 20}" height="${height - 20}" rx="20" fill="none" stroke="#1E2B45" stroke-width="2"/>

  <!-- Left Emblem Group -->
  <g transform="translate(135, 180)">
    <circle cx="0" cy="0" r="88" fill="#0B1324" stroke="url(#ring)" stroke-width="3"/>
    <circle cx="0" cy="0" r="102" fill="none" stroke="#38BDF8" stroke-width="1" stroke-dasharray="5 6" stroke-opacity="0.35"/>
    <!-- Ethereum Diamond -->
    <polygon points="0,-64 -44,2 0,-18" fill="url(#ethL)"/>
    <polygon points="0,-64 44,2 0,-18" fill="url(#ethR)"/>
    <polygon points="0,-18 -44,2 0,26" fill="#627EEA" opacity="0.9"/>
    <polygon points="0,-18 44,2 0,26" fill="#4358B5" opacity="0.95"/>
    <polygon points="0,36 -44,12 0,66" fill="url(#ethL)"/>
    <polygon points="0,36 44,12 0,66" fill="url(#ethR)"/>
  </g>

  <!-- Right Text & Protocol Badges -->
  <g transform="translate(268, 0)">
    <!-- Top Chain Pill -->
    <rect x="0" y="34" width="248" height="26" rx="13" fill="#121D33" stroke="#38BDF8" stroke-width="1.2" stroke-opacity="0.5"/>
    <circle cx="16" cy="47" r="4.5" fill="#10B981"/>
    <text x="28" y="51" font-family="Consolas, monospace" font-weight="700" font-size="11.5" fill="#38BDF8" letter-spacing="1">ETHEREUM MAINNET (ID: 1)</text>

    <!-- Main Title -->
    <text x="0" y="106" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="46" fill="#FFFFFF" letter-spacing="4">TELETH</text>
    <text x="0" y="132" font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="13.5" fill="#94A3B8">Unified Multi-Launchpad Terminal on Uniswap V4</text>

    <!-- 4 Launchpad Cards (Pangea Featured #1) -->
    <!-- Card 1: Pangea -->
    <rect x="0" y="148" width="335" height="35" rx="9" fill="#1A1610" stroke="#F59E0B" stroke-width="1.5" stroke-opacity="0.75"/>
    <circle cx="18" cy="165.5" r="5.5" fill="#F59E0B"/>
    <text x="33" y="170" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="13.5" fill="#FEF3C7">Pangea.trade</text>
    <text x="150" y="170" font-family="Consolas, monospace" font-weight="600" font-size="11.5" fill="#FBBF24">5-Chain Omnichain V4 ⭐</text>

    <!-- Card 2: Stockereum -->
    <rect x="0" y="190" width="335" height="35" rx="9" fill="#111A2E" stroke="#22D3EE" stroke-width="1.2" stroke-opacity="0.45"/>
    <circle cx="18" cy="207.5" r="5.5" fill="#22D3EE"/>
    <text x="33" y="212" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="13.5" fill="#F8FAFC">Stockereum.com</text>
    <text x="164" y="212" font-family="Consolas, monospace" font-weight="600" font-size="11.5" fill="#38BDF8">Tokenized Stocks &amp; ETH</text>

    <!-- Card 3: Sender.family -->
    <rect x="0" y="232" width="335" height="35" rx="9" fill="#111A2E" stroke="#A855F7" stroke-width="1.2" stroke-opacity="0.45"/>
    <circle cx="18" cy="249.5" r="5.5" fill="#A855F7"/>
    <text x="33" y="254" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="13.5" fill="#F8FAFC">Sender.family</text>
    <text x="164" y="254" font-family="Consolas, monospace" font-weight="600" font-size="11.5" fill="#C084FC">Locked V4 + Disperse</text>

    <!-- Card 4: Programmable.market -->
    <rect x="0" y="274" width="335" height="35" rx="9" fill="#111A2E" stroke="#10B981" stroke-width="1.2" stroke-opacity="0.45"/>
    <circle cx="18" cy="291.5" r="5.5" fill="#10B981"/>
    <text x="33" y="296" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="13.5" fill="#F8FAFC">Programmable ($V4)</text>
    <text x="180" y="296" font-family="Consolas, monospace" font-weight="600" font-size="11.5" fill="#34D399">Module Mode &amp; Hooks</text>
  </g>
</svg>
`;
}

async function generateAll() {
  const profilePath = path.join(assetsDir, "teleth-profile-512x512.png");
  const banner640Path = path.join(assetsDir, "teleth-banner-640x360.png");
  const desc640Path = path.join(assetsDir, "teleth-description-640x360.png");

  await sharp(Buffer.from(profileSvg))
    .resize(512, 512)
    .png({ quality: 100 })
    .toFile(profilePath);

  await sharp(Buffer.from(buildBannerSvg(640, 360)))
    .resize(640, 360)
    .png({ quality: 100 })
    .toFile(banner640Path);

  await sharp(Buffer.from(buildBannerSvg(640, 360)))
    .resize(640, 360)
    .png({ quality: 100 })
    .toFile(desc640Path);

  // Copy to artifact directory for preview
  fs.copyFileSync(profilePath, path.join(artifactDir, "teleth-profile-512x512.png"));
  fs.copyFileSync(banner640Path, path.join(artifactDir, "teleth-banner-640x360.png"));
  fs.copyFileSync(desc640Path, path.join(artifactDir, "teleth-description-640x360.png"));

  console.log("Generated all BotFather images successfully!");
}

generateAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
