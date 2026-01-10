import unittest

from fastapi.testclient import TestClient

from app import app, samples_store


class BackendStubTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json().get("status"), "ok")

    def test_list_samples_contains_seed(self):
        resp = self.client.get("/samples")
        self.assertEqual(resp.status_code, 200)
        samples = resp.json()
        self.assertGreaterEqual(len(samples), 1)
        ids = {s["id"] for s in samples}
        self.assertIn("sample-1", ids)

    def test_seed_files_and_spectra(self):
        # files for seed sample
        resp = self.client.get("/samples/sample-1/files")
        self.assertEqual(resp.status_code, 200)
        files = resp.json()
        self.assertGreaterEqual(len(files), 1)

        # spectra for seed sample
        resp = self.client.get("/samples/sample-1/spectra")
        self.assertEqual(resp.status_code, 200)
        spectra = resp.json().get("spectra", [])
        self.assertGreaterEqual(len(spectra), 1)

        spec_id = spectra[0]["id"]
        # spectrum metadata
        resp = self.client.get(f"/spectra/{spec_id}")
        self.assertEqual(resp.status_code, 200)

        # spectrum data
        resp = self.client.get(f"/spectra/{spec_id}/data")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("xData", data)

    def test_import_creates_sample_and_process(self):
        # Build a tiny zip with one .dsc file
        import zipfile
        import io

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("demo.DSC", "TITL=Demo")
        buf.seek(0)

        resp = self.client.post(
            "/imports",
            files={"file": ("demo.zip", buf.getvalue(), "application/zip")},
        )
        self.assertEqual(resp.status_code, 202)
        job = resp.json()
        self.assertIn("id", job)

        # New sample should be present
        samples_resp = self.client.get("/samples")
        self.assertEqual(samples_resp.status_code, 200)
        samples = samples_resp.json()
        # There should be more samples than the seed
        self.assertGreaterEqual(len(samples), 1)

        # Find latest sample (non-seed)
        latest_sample_id = None
        for s in samples:
            if s["id"] != "sample-1":
                latest_sample_id = s["id"]
                break
        self.assertIsNotNone(latest_sample_id)

        # Files should exist (cloned or parsed)
        files_resp = self.client.get(f"/samples/{latest_sample_id}/files")
        self.assertEqual(files_resp.status_code, 200)
        files = files_resp.json()
        self.assertGreaterEqual(len(files), 1)

        # Process should accept and return a job
        proc_resp = self.client.post(
            f"/samples/{latest_sample_id}/process", json={"fileIds": [f["id"] for f in files]}
        )
        self.assertEqual(proc_resp.status_code, 202)
        proc_job = proc_resp.json()
        self.assertEqual(proc_job["status"], "ready")


if __name__ == "__main__":
    unittest.main()
