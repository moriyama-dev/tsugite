# Homebrew cask for Tsugite. Updated by the Release workflow.
#   brew tap moriyama-dev/tsugite https://github.com/moriyama-dev/tsugite
#   brew install --cask tsugite
cask "tsugite" do
  arch arm: "arm64", intel: "x86_64"

  version "0.2.0"
  sha256 arm:   "e03486a8b0653beff9112c0f0ae4bee195fd2f4e097cfe2f5e66efd9321beaaa",
         intel: "3999e238d42aa3379d59fe82bce049db96cb4dff1fd5923c7de14ed359b50744"

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
