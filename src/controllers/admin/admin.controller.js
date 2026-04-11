/**
 * Written by Pradeep
 */
import User from "../../models/user/user.model.js";
import { APIError, catchAsync } from "../../middlewares/errorHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import {
  registerSchema,
  loginSchema,
  registerSchemaSubAdmin,
} from "../../validations/auth/auth.validation.js"; // Reusing auth schemas for now, or define specific admin ones if different
import { PERMISSIONS } from "../../utils/permissions.js";

// Register New Admin (Protected: Only an existing ADMIN can create another ADMIN)
export const registerAdmin = catchAsync(async (req, res, next) => {
  // Validate Input
  const { error } = registerSchema.validate(req.body);
  if (error) return next(new APIError(400, error.details[0].message));

  const { email, phone, firstName, lastName, password, address, gender, dob } =
    req.body;

  // Check if user exists
  const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
  if (existingUser) {
    return next(new APIError(400, "Email or Phone already exists"));
  }

  // Create Admin User
  const newAdmin = await User.create({
    firstName,
    lastName,
    email,
    phone,
    password,
    address,
    gender,
    dob,
    role: "ADMIN", // Explicitly set role
    isVerified: true, // Auto-verify admins created by other admins
    permissions: ["*"],
  });

  const accessToken = newAdmin.generateAccessToken();
  const refreshToken = newAdmin.generateRefreshToken();

  newAdmin.refreshToken = refreshToken;
  await newAdmin.save({ validateBeforeSave: false });

  res.status(201).json(
    new ApiResponse(
      201,
      {
        admin: {
          id: newAdmin._id,
          firstName: newAdmin.firstName,
          lastName: newAdmin.lastName,
          email: newAdmin.email,
          role: newAdmin.role,
        },
      },
      "Admin created successfully",
    ),
  );
});

// Admin Login
export const loginAdmin = catchAsync(async (req, res, next) => {
  const { error } = loginSchema.validate(req.body);
  if (error) return next(new APIError(400, error.details[0].message));

  const { email, password } = req.body;

  // Find user and explicitly check for ADMIN role
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new APIError(401, "Invalid email or password"));
  }

  if (user.role !== "ADMIN" && user.role !== "SUB_ADMIN") {
    return next(new APIError(403, "Access denied. Admin or sub-admin only."));
  }

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        accessToken,
        refreshToken,
        admin: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
        },
      },
      "logged in successfully",
    ),
  );
});

// Get Own Admin Profile
export const getAdminMe = catchAsync(async (req, res) => {
  const admin = req.user; // Already fetched from DB by requireAuth middleware
  res.status(200).json(
    new ApiResponse(
      200,
      {
        admin: {
          id: admin._id,
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
          phone: admin.phone,
          role: admin.role,
          permissions: admin.permissions,
          isVerified: admin.isVerified,
          lastLoginAt: admin.lastLoginAt,
          createdAt: admin.createdAt,
        },
      },
      "Admin profile fetched successfully",
    ),
  );
});

// Update Admin Profile (Self)
export const updateAdmin = catchAsync(async (req, res, next) => {
  const { firstName, lastName, phone, address, gender, dob } = req.body;

  // Basic update logic
  const updatedAdmin = await User.findByIdAndUpdate(
    req.user.id,
    { firstName, lastName, phone, address, gender, dob },
    { new: true, runValidators: true },
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        admin: {
          id: updatedAdmin._id,
          firstName: updatedAdmin.firstName,
          lastName: updatedAdmin.lastName,
          email: updatedAdmin.email,
          role: updatedAdmin.role,
        },
      },
      "Admin profile updated successfully",
    ),
  );
});
// Logout Admin
export const logoutAdmin = catchAsync(async (req, res) => {
  if (req.user) {
    await User.findByIdAndUpdate(req.user.id, {
      $unset: { refreshToken: 1 },
    });
  }

  res
    .status(200)
    .json(new ApiResponse(200, null, "Admin logged out successfully"));
});

// Get All Admins (paginated)
export const getAllAdmins = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = { role: { $in: ["ADMIN", "SUB_ADMIN"] } };
  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const [admins, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select(
        "firstName lastName email phone role isVerified isDisabled lastLoginAt createdAt",
      ),
    User.countDocuments(filter),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        admins,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
      "Admins fetched successfully",
    ),
  );
});

// Get Admin By ID
export const getAdminById = catchAsync(async (req, res, next) => {
  const admin = await User.findOne({
    _id: req.params.id,
    role: { $in: ["ADMIN", "SUB_ADMIN"] },
  }).select(
    "firstName lastName email phone role isVerified isDisabled permissions lastLoginAt createdAt",
  );

  if (!admin) return next(new APIError(404, "Admin not found"));

  res
    .status(200)
    .json(new ApiResponse(200, { admin }, "Admin fetched successfully"));
});

//asgar-code
export const createSubAdmin = catchAsync(async (req, res, next) => {
  // Ensure required fields for validation
  const input = {
    ...req.body,
    role: "SUB_ADMIN", // force role for validation
  };
  const { error } = registerSchemaSubAdmin.validate(input);
  if (error) return next(new APIError(400, error.details[0].message));
  const {
    firstName,
    lastName,
    email,
    password,
    permissions,
    address,
    gender,
    phone,
  } = input;

  // Check duplicate (by email or phone)
  const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
  if (existingUser) {
    return next(new APIError(400, "Email or Phone already exists"));
  }

  // Validate permissions
  const validPermissions = Object.values(PERMISSIONS);
  const filteredPermissions = permissions.filter((p) =>
    validPermissions.includes(p),
  );

  const subAdmin = await User.create({
    firstName,
    lastName,
    email,
    phone, // required by model
    address,
    password,
    role: "SUB_ADMIN",
    permissions: filteredPermissions,
    isVerified: true,
    gender,
  });

  res.status(201).json({
    success: true,
    message: "SubAdmin created successfully",
    data: {
      id: subAdmin._id,
      firstName: subAdmin.firstName,
      lastName: subAdmin.lastName,
      email: subAdmin.email,
      phone: subAdmin.phone,
      role: subAdmin.role,
      permissions: subAdmin.permissions,
    },
  });
});
// Get Own SubAdmin Profile
export const getSubAdminMe = catchAsync(async (req, res) => {
  // req.user.id is set by auth middleware
  const id = req.user.id;
  const subAdmin = await User.findById(id);
  if (!subAdmin || subAdmin.role !== "SUB_ADMIN") {
    return res
      .status(404)
      .json({ success: false, message: "SubAdmin not found" });
  }
  res.status(200).json({
    success: true,
    subAdmin: {
      id: subAdmin._id,
      firstName: subAdmin.firstName,
      lastName: subAdmin.lastName,
      email: subAdmin.email,
      phone: subAdmin.phone,
      role: subAdmin.role,
      permissions: subAdmin.permissions,
      isVerified: subAdmin.isVerified,
      lastLoginAt: subAdmin.lastLoginAt,
      createdAt: subAdmin.createdAt,
    },
  });
});
export const getAllSubAdmin = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(pageSize);

    const query = search
      ? {
          role: "SUB_ADMIN",
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }
      : { role: "SUB_ADMIN" };

    const subAdmins = await User.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const totalCount = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      subAdmins,
      totalCount,
      currentPage: pageNum,
      pageSize: limitNum,
    });
  } catch (error) {
    console.error("Error fetching sub-admins:", error);

    res.status(500).json({
      success: false,
      message: "Error retrieving sub-admins",
      error: error.message,
    });
  }
};

export const getSubAdminById = catchAsync(async (req, res, next) => {
  const id = req.params.id;
  const subAdmin = await User.findById(id)
    .select(
      "firstName lastName email phone role isVerified isDisabled permissions lastLoginAt createdAt",
    )
    .lean();

  if (!subAdmin || subAdmin.role !== "SUB_ADMIN") {
    return next(new APIError(404, "SubAdmin not found"));
  }

  res
    .status(200)
    .json(new ApiResponse(200, { subAdmin }, "SubAdmin fetched successfully"));
});

export const toggleSubAdmin = catchAsync(async (req, res, next) => {
  const id = req.params.id;
  const subAdmin = await User.findById(id);

  if (!subAdmin || subAdmin.role !== "SUB_ADMIN") {
    return next(new APIError(404, "SubAdmin not found"));
  }

  const updatedSubAdmin = await User.findByIdAndUpdate(id, {
    isDisabled: { $toggle: true },
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { subAdmin: updatedSubAdmin },
        "SubAdmin status toggled successfully",
      ),
    );
});

export const logoutSubAdmin = catchAsync(async (req, res, next) => {
  const id = req.user.id; // Assuming the id is available in req.user

  if (!id) {
    return next(new APIError(401, "Not authenticated"));
  }

  await User.findByIdAndUpdate(id, {
    $unset: { refreshToken: 1, accessToken: 1 },
  });

  res.status(200).json(new ApiResponse(200, null, "Logged out successfully"));
});
//permission
export const getAllPermissions = catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    permissions: Object.values(PERMISSIONS),
  });
});
