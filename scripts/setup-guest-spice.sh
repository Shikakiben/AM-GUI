#!/usr/bin/env sh
set -eu

# setup-guest-spice.sh
# Simple helper to install and enable spice-vdagent in common guest OSes.
# Usage: sudo sh setup-guest-spice.sh  or sudo ./setup-guest-spice.sh
# Options:
#   -y, --yes         non interactif, accepte l'installation des paquets optionnels
#   --diagnose        exécute des vérifications/diagnostics et sort
#   -h, --help        affiche l'aide

FORCE_NO_PROMPT=0
DIAGNOSE=0

print_help() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]
Options:
  -y, --yes       non interactif, accepte l'installation des paquets optionnels
  --diagnose      exécute des diagnostics (affiche status des services/modules/logs)
  -h, --help      affiche ce message
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -y|--yes) FORCE_NO_PROMPT=1; shift;;
    --diagnose) DIAGNOSE=1; shift;;
    -h|--help) print_help; exit 0;;
    *) echo "Argument inconnu: $1"; print_help; exit 2;;
  esac
done

run_diagnostics() {
  echo "==> Diagnostics : processus liés à spice"
  ps aux | egrep 'spice|spice-vdagent|qxl' || true
  echo "\n==> Statut du service (OpenRC si disponible)"
  if command -v rc-service >/dev/null 2>&1; then
    rc-service spice-vdagentd status || true
  fi
  echo "\n==> Modules chargés (qxl, spice)"
  lsmod | egrep 'qxl|spice' || true
  echo "\n==> dmesg (filtre spice/qxl)"
  dmesg | egrep -i 'spice|qxl' || true
  echo "\n==> Logs (grep 'spice' dans /var/log)"
  grep -i spice /var/log/* 2>/dev/null || true
  echo "\nSi le service n'est pas actif: essaye 'sudo rc-service spice-vdagentd start' et redémarre la VM."
}

if [ "$DIAGNOSE" -eq 1 ]; then
  run_diagnostics
  exit 0
fi

echo "==> Détection de la distribution..."
if [ -f /etc/alpine-release ]; then
  echo "Alpine Linux détectée — installation avec apk"
  apk update
  apk add --no-cache spice-vdagent || true

  if command -v rc-service >/dev/null 2>&1; then
    echo "Démarrage et activation du service spice-vdagentd"
    rc-service spice-vdagentd start || true
    rc-update add spice-vdagentd default || true
  fi

  echo
  printf "Installer aussi xf86-video-qxl et qemu-guest-agent ? (y/N) : "
  read ans || true
  if [ "${ans}" = "y" ] || [ "${ans}" = "Y" ]; then
    apk add --no-cache xf86-video-qxl qemu-guest-agent || true
    rc-service qemu-guest-agent start || true
    rc-update add qemu-guest-agent default || true
  fi

  echo "Fini — redémarre la VM si nécessaire."
  exit 0
fi

if [ -f /etc/os-release ]; then
  . /etc/os-release
  case "${ID:-}" in
    debian|ubuntu)
      echo "Debian/Ubuntu détecté — installation avec apt"
      apt update
      apt install -y spice-vdagent || true
      systemctl enable --now spice-vdagent.service || true
      echo "Fini — redémarre la VM si nécessaire."
      exit 0
      ;;
    fedora|rhel|centos)
      echo "Fedora/RHEL/CentOS détecté — installation avec dnf"
      dnf install -y spice-vdagentd || true
      systemctl enable --now spice-vdagentd.service || true
      echo "Fini — redémarre la VM si nécessaire."
      exit 0
      ;;
  esac
fi

echo "Distribution non reconnue par le script. Installez manuellement 'spice-vdagent' ou 'spice-vdagentd' selon votre distro."
exit 1
