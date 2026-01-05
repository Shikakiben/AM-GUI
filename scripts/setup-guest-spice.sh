#!/usr/bin/env sh
set -eu

# setup-guest-spice.sh
# Simple helper to install and enable spice-vdagent in common guest OSes.
# Usage: sudo sh setup-guest-spice.sh  or sudo ./setup-guest-spice.sh

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
