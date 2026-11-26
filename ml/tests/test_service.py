"""Service FastAPI (service.py) : contrat de /score-session et des routes unitaires."""
import pytest

from .conftest import requires_artifacts

pytestmark = requires_artifacts
fastapi_testclient = pytest.importorskip("fastapi.testclient")


@pytest.fixture(scope="module")
def client():
    import service
    return fastapi_testclient.TestClient(service.app)


ANSWERS = [{"seconds": 40, "correct": True}] * 12 + [{"seconds": 400, "correct": False}] * 3


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_score_session_browser_only(client):
    r = client.post("/score-session", json={"tot_question": 20, "session_seconds": 1500, "answers": ANSWERS})
    assert r.status_code == 200
    d = r.json()
    assert d["webcam"] is None and d["fusion"]["mode"] == "navigateur seul"
    assert d["navigateur"]["indicateurs"]["que_att_within_idl_time"] == 12
    assert 0 <= d["fusion"]["score"] <= 1 and len(d["navigateur"]["explication"]["contributions"]) == 5


def test_score_session_with_frames(client, webcam_payload):
    bad = dict(webcam_payload, hand_count=99)
    frames = [webcam_payload] * 150 + [bad]
    r = client.post("/score-session", json={"tot_question": 20, "session_seconds": 1500,
                                            "answers": ANSWERS, "frames": frames, "k": 3})
    assert r.status_code == 200
    d = r.json()
    w = d["webcam"]
    assert w["n_images"] == 150 and w["images_invalides"] == 1
    assert len(w["chronologie"]) == 120
    assert d["fusion"]["mode"] == "webcam + navigateur"
    assert len(w["image_la_plus_suspecte"]["explication"]["contributions"]) == 3


def test_ideal_seconds_parameter(client):
    body = {"tot_question": 20, "session_seconds": 1500, "answers": ANSWERS}
    default = client.post("/score-session", json=body).json()["navigateur"]
    short = client.post("/score-session", json={**body, "ideal_seconds": 30}).json()["navigateur"]
    assert default["temps_ideal_s"] == 180 and short["temps_ideal_s"] == 30
    assert default["indicateurs"]["que_att_within_idl_time"] == 12   # 40 s <= 180 s
    assert short["indicateurs"]["que_att_within_idl_time"] == 0      # 40 s > 30 s
    assert client.post("/score-session", json={**body, "ideal_seconds": 1}).status_code == 422


def test_score_session_rejects_bad_input(client):
    assert client.post("/score-session", json={"tot_question": 0, "session_seconds": 10}).status_code == 422
    r = client.post("/score-session", json={"tot_question": 2, "session_seconds": 10,
                                            "answers": [{"seconds": 1, "correct": True}] * 3})
    assert r.status_code == 422          # plus de reponses que de questions
    assert client.post("/score-session", json={"tot_question": 5, "session_seconds": 10,
                                                "unknown": 1}).status_code == 422


def test_unit_routes(client, browser_payload):
    assert client.post("/predict/browser", json=browser_payload).status_code == 200
    assert client.post("/fuse", json={"sa": 0.2, "sb": 0.8, "w": 0.5}).json()["score"] == pytest.approx(0.5)
    assert client.post("/explain/browser?k=2", json=browser_payload).json()["contributions"].__len__() == 2
    assert client.post("/predict/browser", json={"tot_question": 3}).status_code == 422
