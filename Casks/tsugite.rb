# Homebrew cask for Tsugite. Updated by the Release workflow.
#   brew tap moriyama-dev/tsugite https://github.com/moriyama-dev/tsugite
#   brew install --cask tsugite
cask "tsugite" do
  arch arm: "arm64", intel: "x86_64"

  version "0.0.0"
  sha256 arm:   "0000000000000000000000000000000000000000000000000000000000000000",
         intel: "0000000000000000000000000000000000000000000000000000000000000000"

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
