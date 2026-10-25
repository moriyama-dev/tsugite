# Homebrew cask for Tsugite. Updated by the Release workflow.
#   brew tap moriyama-dev/tsugite https://github.com/moriyama-dev/tsugite
#   brew install --cask moriyama-dev/tsugite/tsugite
cask "tsugite" do
  arch arm: "arm64", intel: "x86_64"

  version "0.3.5"
  sha256 arm:   "7c78dfd63b8e77208f34244062d98b74ae0bc2aab380f8765be18ed5f06b6827",
         intel: "788cd392ee263dc826d94fa3cf6449473469442b0cff681261e1138dfd39b843"

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
