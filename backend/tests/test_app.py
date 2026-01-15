import unittest
import sys
import os
import io
import zipfile
import uuid
from unittest.mock import patch

# Add parent directory to path so we can import app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

# Force UPLOAD_DIR to be relative for tests (avoids PermissionError in CI)
os.environ["UPLOAD_DIR"] = "data"

from app import app, Spectrum1D, SpectrumFileModel
from database import create_db_and_tables

class BackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create Tables explicitly because TestClient(app) doesn't run startup events
        create_db_and_tables()
        cls.client = TestClient(app)
        cls.username = f"user_{uuid.uuid4()}"
        cls.password = "securepass"

    def create_dummy_zip(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("test.DSC", "TITL=Test")
            zf.writestr("test.DTA", b"DATA")
        buf.seek(0)
        return buf

    def test_health(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "ok")

    @patch("app.parse_and_process")
    def test_guest_flow(self, mock_parse):
        # Mock successful parsing
        mock_parse.return_value = (
            "test_sample",
            {"spec-1": Spectrum1D(id="spec-1", filename="test.DSC", type="CW", xLabel="B", yLabel="I", xData=[1,2], realData=[3,4], imagData=[])},
            [SpectrumFileModel(id="file-1", filename="test.DSC", type="CW", selected=True)],
            {"CW": 1}
        )

        # 1. Login as Guest
        auth_resp = self.client.post("/auth/guest")
        self.assertEqual(auth_resp.status_code, 200)
        token = auth_resp.json()["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Upload File
        zip_buf = self.create_dummy_zip()
        import_resp = self.client.post(
            "/imports",
            files={"file": ("guest_test.zip", zip_buf.getvalue(), "application/zip")},
            headers=headers
        )
        self.assertEqual(import_resp.status_code, 202)
        
        # 3. List Samples
        samples_resp = self.client.get("/samples", headers=headers)
        self.assertEqual(samples_resp.status_code, 200)
        samples = samples_resp.json()
        self.assertGreaterEqual(len(samples), 1)
        
        # Get Sample ID
        sample_id = samples[-1]["id"] # Get most recent
        
        # 4. List Files
        files_resp = self.client.get(f"/samples/{sample_id}/files", headers=headers)
        self.assertEqual(files_resp.status_code, 200)
        files = files_resp.json()
        
        # 5. Process (Filter) selection
        if files:
            file_id = files[0]["id"]
            proc_resp = self.client.post(
                f"/samples/{sample_id}/process",
                json={"fileIds": [file_id]},
                headers=headers
            )
            self.assertEqual(proc_resp.status_code, 202)

    @patch("app.parse_and_process")
    def test_auth_and_persistence(self, mock_parse):
        # Mock successful parsing
        mock_parse.return_value = (
            "Auth Sample",
            {"spec-1": Spectrum1D(id="spec-1", filename="auth.DSC", type="CW", xLabel="B", yLabel="I", xData=[1,2], realData=[3,4], imagData=[])},
            [SpectrumFileModel(id="file-1", filename="auth.DSC", type="CW", selected=True)],
            {"CW": 1}
        )

        # 1. Register
        reg_resp = self.client.post(
            "/auth/register",
            json={"username": self.username, "password": self.password}
        )
        if reg_resp.status_code == 400:
            pass 
        else:
            self.assertEqual(reg_resp.status_code, 200)

        # 2. Login
        login_resp = self.client.post(
            "/auth/login",
            data={"username": self.username, "password": self.password}
        )
        self.assertEqual(login_resp.status_code, 200)
        token = login_resp.json()["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        # 3. Upload Protected File
        zip_buf = self.create_dummy_zip()
        import_resp = self.client.post(
            "/imports",
            files={"file": ("auth_test.zip", zip_buf.getvalue(), "application/zip")},
            headers=headers
        )
        self.assertEqual(import_resp.status_code, 202)

        # 4. List Samples (Should see it)
        samples_resp = self.client.get("/samples", headers=headers)
        self.assertEqual(samples_resp.status_code, 200)
        self.assertTrue(any(s["name"] == "auth_test.zip" or s["name"] == "Auth Sample" for s in samples_resp.json()))

if __name__ == "__main__":
    unittest.main()
