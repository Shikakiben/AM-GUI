# AM-GUI

**AM-GUI** is an Electron-based application that serves as a graphical App Store for [AM](https://github.com/ivan-hc/AM). “AM”/“AppMan” is a set of scripts and modules for installing, updating, and managing AppImage packages and other portable formats on Linux.

⚠️ **This project is not yet functional: it is under development and some features may not work or may be incomplete.**

   **ALL credit goes to [Ivan](https://github.com/ivan-hc) for his amazing work! I only make the GUI using AI.**
   
---

## Features

- **Displays a catalog of AppImage applications** available via AM/appman, with icons.
- **One-click installation and removal** of AppImage applications.
- **Fast search and sorting** of software

---



## Requirements (manual installation)

- [Node.js](https://nodejs.org/) (>=20, 22 recommended)
- [AM](https://github.com/ivan-hc/AM) installed and available in your system PATH

*Electron, npm, node-pty, undici, etc. are installed automatically via `npm install`.*

### Native modules (node-pty): required build tools

you may need to install the following build tools (for git and maybe more):

- **Debian/Ubuntu**:
   ```bash
   sudo apt install build-essential python3 make gcc g++
   ```
- **Fedora**:
   ```bash
   sudo dnf install @development-tools python3
   ```

On most development machines, these tools are already present. If you get a compilation error during `npm install` , install the tools for your distribution as shown above.

---

## Installation

Clone this repository:

```bash
git clone https://github.com/Shikakiben/AM-AppStore-Test.git
cd AM-AppStore-Test
npm install
npx electron-rebuild
```

---

## Usage

1. Make sure `AM` or `appman` is installed and functional (`am -l` or `appman -l` should return the list of applications).
2. Launch the app:

```bash
npm start
```

3. Browse, install, or uninstall the AppImage applications of your choice.

---



## Acknowledgements

Thanks to [Ivan](https://github.com/ivan-hc) and the [pkgforge community](https://github.com/pkgforge-dev) for their outstanding work managing and distributing AppImages on Linux.


---

## License

This project is licensed under the **GNU General Public License v3.0 (GPLv3)**, the same as the original AM project.

See the LICENSE file for details.
