"""Regression checks for the deployment wizard. Run with python3 -m unittest discover -s deploy."""
import ipaddress
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

cli = runpy.run_path(str(Path(__file__).resolve().parents[1] / "tmodvision"))


class DeploymentTests(unittest.TestCase):
    def test_address_and_acl(self):
        self.assertEqual(cli["endpoint"]("PANEL.Example.com.", "domain"), "panel.example.com")
        for value in ["127.0.0.1", "10.2.0.1", "::1", "224.1.2.3"]:
            with self.assertRaises(ValueError):
                cli["endpoint"](value, "ip")
        for value in ["localhost", "example.com:443", "1.2.3.4", "*.example.org"]:
            with self.assertRaises(ValueError):
                cli["endpoint"](value, "domain")
        self.assertEqual(cli["networks"]("10.2.1.1/16, ::1"), ["10.2.0.0/16", "::1/128"])
        host = str(ipaddress.IPv6Address("2606:4700:4700::1111"))
        self.assertEqual(cli["origin"]({"host": host}), "https://[" + host + "]")

    def test_bootstrap_keeps_backend_private(self):
        bootstrap = cli["nginx"]()
        self.assertIn("/.well-known/acme-challenge/", bootstrap)
        self.assertNotIn("proxy_pass", bootstrap)
        cfg = {"host": "panel.example.org", "mode": "domain", "allow": ["192.0.2.1/32"]}
        https = cli["nginx"](cfg)
        self.assertIn("allow 192.0.2.1/32;\ndeny all;", https)
        self.assertNotIn("deny all", https.split("listen 443")[0])
        self.assertIn("proxy_set_header Upgrade", https)

    def test_corrupt_registry_is_not_treated_as_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "servers.json"
            path.write_text("{")
            with self.assertRaises(cli["Problem"]):
                cli["registry"](tmp)
            path.write_text("[]")
            self.assertEqual(cli["registry"](tmp), 0)

    def test_wizard_keeps_existing_data_and_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            data = root / "previous data"
            data.mkdir()
            (data / "servers.json").write_text('[{"id":"existing"}]')
            pending = root / "settings" / "pending.json"
            original = {"data": str(data), "token": "previous-private-credential", "project": "legacy"}
            answers = ["2", "panel.example.com", "2", "192.0.2.1", str(root / "other"), "", "1", "1"]
            with patch.dict(cli["wizard"].__globals__, {"ROOT": root, "PENDING": pending, "dns": lambda _: [],
                                                        "addresses": lambda: []}), patch("builtins.input", side_effect=answers), patch("builtins.print"):
                cfg = cli["wizard"](original, True)
            self.assertEqual(cfg["data"], str(data))
            self.assertEqual(cfg["token"], original["token"])
            self.assertEqual(cfg, cli["read"](pending))
            self.assertEqual(pending.stat().st_mode & 0o777, 0o600)
