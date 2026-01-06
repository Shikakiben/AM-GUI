<div align="center">
  <img src="https://github.com/Shikakiben/AM-GUI/blob/main/AM-GUI.png?raw=true" width="60">
  <h1 align="center">AM-GUI</h1>
  <p align="center">A simple graphical frontend to easily install, update, and manage AppImage and other portable formats on Linux, powered by <a href="https://github.com/ivan-hc/AM">AM</a>.</p>
  
[![GitHub Downloads](https://img.shields.io/github/downloads/Shikakiben/AM-GUI/total?logo=github&label=GitHub%20Downloads)](https://github.com/Shikakiben/AM-GUI/releases/latest)
[![CI Build Status](https://github.com//Shikakiben/AM-GUI/actions/workflows/appimage.yml/badge.svg)](https://github.com/Shikakiben/AM-GUI/releases/latest)

<br>
  
  <img src="screenshots/light.png" width="800"/>

</div>
<br>
<br>
<br>

  
* [Latest Release](https://github.com/Shikakiben/AM-GUI/releases/latest)  (AppImage — Beta)

If you already have AM: use `am -i am-gui` or `appman -i am-gui` (depending on your configuration).

If not, download the latest release and follow the installation steps.  
To integrate AM-GUI into your system, reinstall it via the app (search "AM-GUI") and you may remove the downloaded release afterward.
<br>
<br>


⚠️ **This project is under development — some features may be incomplete or may not work.**  
Please report issues on GitHub: https://github.com/Shikakiben/AM-GUI/issues — your reports are very helpful.

---

  **ALL credit goes to [Ivan](https://github.com/ivan-hc) for his amazing work! I only handle the GUI, learning how to properly yell at gpt-4.1, to make sure that this little f$@¤=# does not mess that much with the code.**
   
---


## Development installation

- Requirements:

  [Node.js](https://nodejs.org/) (>=20, 22 recommended)

If you don't have it in your package manager, see: https://nodejs.org/fr/download

&nbsp;you may need to install the following build tools:

*Debian/Ubuntu*:
   ```bash
   sudo apt install build-essential python3 make gcc g++
   ```
*Fedora*:
   ```bash
   sudo dnf install @development-tools python3
   ```


- Clone the repository and install:

```bash
git clone https://github.com/Shikakiben/AM-GUI.git
cd AM-GUI
npm install
npx electron-rebuild
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
