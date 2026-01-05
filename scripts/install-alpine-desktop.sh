#!/bin/sh
# Script d'installation automatique de XFCE sur Alpine Linux
# Désinstalle GNOME et installe XFCE + utilitaires essentiels

echo "=== Début installation environnement de bureau Alpine Linux ==="

echo "=== Désinstallation GNOME ==="
apk del gnome gnome-shell gdm gnome-session 2>/dev/null || echo "GNOME non installé, on continue..."
rc-update del gdm 2>/dev/null || echo "Service gdm non actif, on continue..."

echo "=== Configuration des dépôts ==="
echo 'http://dl-cdn.alpinelinux.org/alpine/v3.19/community' >> /etc/apk/repositories
apk update

echo "=== Installation X11 et XFCE ==="
apk add xorg-server xf86-video-vesa xf86-input-evdev xfce4 xfce4-terminal lightdm lightdm-gtk-greeter

echo "=== Installation utilitaires essentiels ==="
apk add sudo dbus firefox

echo "=== Configuration des services ==="
rc-update add dbus
rc-update add lightdm

echo "=== Configuration utilisateur ==="
adduser -g 'User' user
adduser user wheel
echo '%wheel ALL=(ALL) ALL' >> /etc/sudoers

echo "=== Installation terminée ! ==="
echo "Redémarrez avec la commande: reboot"
echo "Puis connectez-vous avec l'utilisateur 'user'"