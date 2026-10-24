# Homebrew cask for Tsugite. Updated by the Release workflow.
#   brew tap moriyama-dev/tsugite https://github.com/moriyama-dev/tsugite
#   brew install --cask moriyama-dev/tsugite/tsugite
cask "tsugite" do
  arch arm: "arm64", intel: "x86_64"

  version "0.3.2"
  sha256 arm:   "d5e1179daa4299d89f4361c37f6859b39efb69480c238433325a096e6effca13",
         intel: "8d13c960a720776d6ad2e39dcbbd38f78bb819b4ce3a00a7c111cbc718856ca0"

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
