# Homebrew cask for Tsugite. Updated by the Release workflow.
#   brew tap moriyama-dev/tsugite https://github.com/moriyama-dev/tsugite
#   brew install --cask moriyama-dev/tsugite/tsugite
cask "tsugite" do
  arch arm: "arm64", intel: "x86_64"

  version "0.4.0"
  sha256 arm:   "7c6c35eaa6416ab987dbe70a65bde7bbc3bca8ed0e526f31825ff5492835934b",
         intel: "c3e1a3ba88882f4e37bc8f5496bd299a36c07bbd7d781c61d90a8c3d67fd2bdb"

  url "https://github.com/moriyama-dev/tsugite/releases/download/#{version}/tsugite-#{version}-macos-#{arch}.dmg"
  name "Tsugite"
  desc "Terminal with Tailscale machines and a file explorer that follows your shell"
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
