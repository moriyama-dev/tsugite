# Homebrew cask for Tsugite. Updated by the Release workflow.
#   brew tap moriyama-dev/tsugite https://github.com/moriyama-dev/tsugite
#   brew install --cask moriyama-dev/tsugite/tsugite
cask "tsugite" do
  arch arm: "arm64", intel: "x86_64"

  version "0.3.3"
  sha256 arm:   "00b0d0831b52162711ff035b329b1ee1b253efb4d3a18beccda7464f60f31f00",
         intel: "1433647d840267c627b2cb5bf140110e43cbf5aa6d5c37b84c69b65e6b9533a1"

  url "https://github.com/moriyama-dev/tsugite/releases/download/#{version}/tsugite-#{version}-macos-#{arch}.dmg"
  name "Tsugite"
  desc "Terminal-first SSH client with Tailscale and Claude Code"
  homepage "https://github.com/moriyama-dev/tsugite"

  depends_on macos: ">= :monterey"

  app "Tsugite.app"

  # The app is not notarized: remove the quarantine flag so that it opens
  # without the "cannot be verified" warning.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Tsugite.app"]
  end

  zap trash: "~/Library/Application Support/tsugite"
end
