from fastapi import APIRouter, Depends

from app.models.user import User
from app.core.dependencies import get_current_user, require_roles


router = APIRouter(
    prefix="/users",
    tags=["Users"]
)


@router.get("/me")
def get_my_profile(
    current_user: User = Depends(get_current_user)
):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role
    }


@router.get("/recruiter-area")
def recruiter_area(
    current_user: User = Depends(
        require_roles("Recruiter", "Admin")
    )
):
    return {
        "message": "Recruiter area access granted",
        "user": current_user.name,
        "role": current_user.role
    }


@router.get("/admin-area")
def admin_area(
    current_user: User = Depends(
        require_roles("Admin")
    )
):
    return {
        "message": "Admin area access granted",
        "user": current_user.name,
        "role": current_user.role
    }