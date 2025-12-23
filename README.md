# AM-GUI

**AM-GUI** is an Electron-based application that serves as a graphical Front for [AM](https://github.com/ivan-hc/AM). “AM”/“AppMan” is a set of scripts and modules for installing, updating, and managing AppImage packages and other portable formats on Linux.

⚠️ **This project is under development and some features may not work or may be incomplete.**

   **ALL credit goes to [Ivan](https://github.com/ivan-hc) for his amazing work! I only make the GUI using AI.**
   
---

## Requirements (manual installation)

- [Node.js](https://nodejs.org/) (>=20, 22 recommended)

if you d'ont have it on your package manager see: https://nodejs.org/fr/download

- you may need to install the following build tools 

 **Debian/Ubuntu**:
   ```bash
   sudo apt install build-essential python3 make gcc g++
   ```
 **Fedora**:
   ```bash
   sudo dnf install @development-tools python3
   ```
---

## Installation

Clone this repository:

```bash
git clone https://github.com/Shikakiben/AM-GUI.git
cd AM-GUI
npm install
npx electron-rebuild
```

---

## Usage

1. Launch the app:

```bash
npm start
```
2. follow AM/AppMan installation if you don't have it already on your system

3. Browse, install, or uninstall the AppImage applications of your choice.

---



## Acknowledgements

Thanks to [Ivan](https://github.com/ivan-hc) and the [pkgforge community](https://github.com/pkgforge-dev) for their outstanding work building, managing and distributing AppImages on Linux.


---

## License

This project is licensed under the **GNU General Public License v3.0 (GPLv3)**.

See the LICENSE file for details.
