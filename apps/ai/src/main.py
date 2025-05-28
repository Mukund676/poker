from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class State(BaseModel):
    pot: int
    hole: list[int]
    community: list[int]

@app.post("/action")
def choose_action(state: State):
    return {"action": "fold", "amount": 0}