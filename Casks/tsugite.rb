# Homebrew cask for Tsugite. Updated by the Release workflow.
#   brew tap moriyama-dev/tsugite https://github.com/moriyama-dev/tsugite
#   brew install --cask moriyama-dev/tsugite/tsugite
cask "tsugite" do
  arch arm: "arm64", intel: "x86_64"

  version "0.3.4"
  sha256 arm:   "54fe81290c99806fcf1ba3f8f7a9ff1632278b6ea391e0d066d8415a42a419bc",
         intel: "c6d2b6c4cc45d061d78c0710567928b059bddcaa4553c0bb5c1615e845e811b0"

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
