<p align="center">
  <img src="https://github.com/Shikakiben/AM-GUI/blob/main/AM-GUI.png?raw=true" width="128" /> 
</p>



# AM-GUI

[![GitHub Downloads](https://img.shields.io/github/downloads/Shikakiben/AM-GUI/total?logo=github&label=GitHub%20Downloads)](https://github.com/Shikakiben/AM-GUI/releases/latest)
[![CI Build Status](https://github.com//Shikakiben/AM-GUI/actions/workflows/appimage.yml/badge.svg)](https://github.com/Shikakiben/AM-GUI/releases/latest)



* [Latest Stable Release](https://github.com/Shikakiben/AM-GUI/releases/latest)  AppImage , Beta , it will be helpfull to reporte  issues , Alpine linux need more testing 



---

**AM-GUI** is an Electron-based application that serves as a graphical Front for [AM](https://github.com/ivan-hc/AM). “AM”/“AppMan” is a set of scripts and modules for installing, updating, and managing AppImage packages and other portable formats on Linux.

⚠️ **This project is under development and some features may not work or may be incomplete.**

   **ALL credit goes to [Ivan](https://github.com/ivan-hc) for his amazing work! I only handel the GUI, learning how to proprely yell at gpt-4.1, to make sur that this little f$@¤=# does not mess that much with the code.**
   
---


## developemen installation

- requirement:

  [Node.js](https://nodejs.org/) (>=20, 22 recommended)

if you d'ont have it on your package manager see: https://nodejs.org/fr/download

  you may need to install the following build tools 

 *Debian/Ubuntu*:
   ```bash
   sudo apt install build-essential python3 make gcc g++
   ```
 *Fedora*:
   ```bash
   sudo dnf install @development-tools python3
   ```


- Clone repository and install:

```bash
git clone https://github.com/Shikakiben/AM-GUI.git
cd AM-GUI
npm install
```


- Launch the app:

```bash
npm start
```


---


## Acknowledgements

Thanks to [Ivan](https://github.com/ivan-hc) and the [pkgforge community](https://github.com/pkgforge-dev) for their outstanding work building, managing and distributing AppImages on Linux.

---
---

## License

This project is licensed under the **GNU General Public License v3.0 (GPLv3)**.

See the LICENSE file for details.
