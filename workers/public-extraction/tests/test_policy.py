import asyncio
import os
import unittest
from unittest.mock import patch

os.environ["PUBLIC_EXTRACTION_ALLOWED_HOSTS"] = "example.org"

from app.main import ExtractionRequest, bounded, validate_public_url
from pydantic import ValidationError


class PolicyTests(unittest.TestCase):
    def test_request_forbids_sensitive_or_renderer_fields(self):
        for field in ("cookies", "headers", "credentials", "extractor"):
            with self.assertRaises(ValidationError):
                ExtractionRequest(url="https://example.org/news", **{field: "secret"})

    def test_private_destination_is_rejected(self):
        with patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("127.0.0.1", 443))]):
            with self.assertRaisesRegex(Exception, "public addresses"):
                asyncio.run(validate_public_url("https://example.org/news"))

    def test_unapproved_host_and_url_credentials_are_rejected(self):
        with self.assertRaisesRegex(Exception, "policy-approved"):
            asyncio.run(validate_public_url("https://other.example/news"))
        with self.assertRaisesRegex(Exception, "credential-free"):
            asyncio.run(validate_public_url("https://user:secret@example.org/news"))

    def test_content_is_bounded(self):
        self.assertEqual(bounded("abcdef", 3), ("abc", True))


if __name__ == "__main__":
    unittest.main()
