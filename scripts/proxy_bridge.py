#!/usr/bin/env python3
"""
Proxy bridge: forwards 0.0.0.0:<listen_port> -> 127.0.0.1:<upstream_port>.

Used because the local proxy (Clash/Mihomo on 127.0.0.1:7897) only binds to
loopback, but the container needs to reach it via the host gateway
(192.168.64.1) inside the container network.

Run this on the host BEFORE starting the container. It is a plain TCP
forwarder — sufficient because both HTTP CONNECT and SOCKS are TCP-based.
"""
from __future__ import annotations

import argparse
import socket
import sys
import threading


def pipe(src: socket.socket, dst: socket.socket) -> None:
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        try:
            dst.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def handle(client: socket.socket, upstream_host: str, upstream_port: int) -> None:
    try:
        upstream = socket.create_connection((upstream_host, upstream_port), timeout=10)
    except OSError as e:
        print(f"[bridge] upstream connect failed: {e}", file=sys.stderr)
        client.close()
        return
    t1 = threading.Thread(target=pipe, args=(client, upstream), daemon=True)
    t2 = threading.Thread(target=pipe, args=(upstream, client), daemon=True)
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    client.close()
    upstream.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--listen-host", default="0.0.0.0")
    ap.add_argument("--listen-port", type=int, default=17897)
    ap.add_argument("--upstream-host", default="127.0.0.1")
    ap.add_argument("--upstream-port", type=int, default=7897)
    args = ap.parse_args()

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((args.listen_host, args.listen_port))
    srv.listen(128)
    print(
        f"[bridge] listening on {args.listen_host}:{args.listen_port} "
        f"-> {args.upstream_host}:{args.upstream_port}",
        flush=True,
    )
    try:
        while True:
            client, addr = srv.accept()
            threading.Thread(
                target=handle,
                args=(client, args.upstream_host, args.upstream_port),
                daemon=True,
            ).start()
    except KeyboardInterrupt:
        print("[bridge] shutting down", file=sys.stderr)
    finally:
        srv.close()


if __name__ == "__main__":
    main()
