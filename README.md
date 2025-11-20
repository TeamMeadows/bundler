<h1 align="center">
  <img src="assets/logo.png"/>
  <p align="center">Meadows Bundler</p>

  <img src="https://img.shields.io/github/release/TeamMeadows/bundler.svg">
  <img src="https://img.shields.io/github/issues/TeamMeadows/bundler.svg">
  <img src="https://img.shields.io/github/license/TeamMeadows/bundler.svg">
</h1>

> Why should your players download the full source code of addons on the production branch,
> when you can send them just minimized code, which will be 40% smaller?
> That's an average of 10 MB of traffic per player.

**Meadows Bundler** is a universal Lua minifier for your Garry's Mod addons and [Atomic Framework](https://github.com/TeamMeadows/atomic-framework) packages.

# Usage
**Meadows Bundler** is a GitHub Action, so your just needed to create [Workflow]() in your GitHub repository.

### Lua side usage
**Meadows Bundler** adds a new comment-based directive - ``---@include``,
that “pastes” the specified file into the current.

> [!IMPORTANT]
> ``@include`` directive doesn't support dynamic strings (like concatination)

```lua
---@include
include("somefile.lua")
include("otherfile.lua")
otherIncludeFunction("someotherfile.lua")

-- including will be ended on an empty line
```

### GitHub Workflow usage
```yaml
steps:
  - uses: TeamMeadows/bundler@v0.1.0
    with:
      name: foldername # Required!

      # optional parameters
      type: package # also could be "addon"
      generate-docs: true # should bundler create file for LuaLS with classes, types for your addon/package?
  - uses: @actions/
````

### Real usecase
See how [Atomic Framework builds](https://github.com/TeamMeadows/atomic-framework/blob/production/.github/workflows/build.yml).

# To Do
- [ ] LuaLS documentation generation
- [ ] Mono-repository support
- [ ] Also make CLI tool for this

<a href="https://github.com/TeamMeadows/atomic-framework">
  <p align="center">
    <img src="https://github.com/TeamMeadows/atomic-framework/blob/develop/assets/badges/dark/ecosystem.png?raw=true"/>
  </p>
</a>