from sqlalchemy import Column, Float, Integer, String
from database import Base


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    department = Column(String, nullable=False)
    email = Column(String, nullable=False, default="")
    salary = Column(Float, nullable=False, default=0)
    status = Column(String, nullable=False, default="Active")

