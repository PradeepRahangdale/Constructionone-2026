import Banner from "../models/banner/banner.model.js";
import Pcategory from "../models/category/pcategory.model.js";
import Product from "../models/vendorShop/product.model.js";
import { VendorProfile } from "../models/vendorShop/vendor.model.js";
import Brand from "../models/vendorShop/brand.model.js";
import FlashSale from "../models/flashSale/flashSale.model.js";
import FlashSaleItem from "../models/flashSale/flashSaleItem.model.js";

const applySourceFilter = (filter, section) => {
    if (section.sourceId) {
        filter._id = section.sourceId;
    }
    switch (section.sourceType) {
        case "FEATURED":
            filter.isFeatured = true;
            break;
        case "TOP_SELLING":
            filter.isTopSelling = true;
            break;
        case "FLASH":
            filter.isFlashSale = true;
            break;
        case "NEW_ARRIVALS":
            filter.createdAt = {
                $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            };
            break;
    }
    return filter;
};

const resolveBANNER = async (section) => {
    return Banner.find(
        applySourceFilter({ moduleId: section.moduleId, isActive: true }, section),
    )
        .sort({ order: 1 })
        .limit(section.limit)
        .select("image title redirectUrl order")
        .lean();
};

const resolvePRODUCT_LIST = async (section) => {
    const filter = applySourceFilter({ moduleId: section.moduleId, disable: false }, section);
    
    if (section.searchKeyword) {
        filter.name = { $regex: section.searchKeyword, $options: 'i' };
    }

    return Product.find(filter)
        .sort({ createdAt: -1 })
        .limit(section.limit)
        .select("name thumbnail slug brandId discount sold avgRating")
        .lean();
};

const resolveCATEGORY_LIST = async (section) => {
    return Pcategory.find(
        applySourceFilter({ moduleId: section.moduleId, isActive: true }, section),
    )
        .sort({ order: 1 })
        .limit(section.limit)
        .select("name image slug")
        .lean();
};

//pradeep-code
// const resolveVENDOR_LIST = async (section) => {
//     return VendorProfile.find(
//         applySourceFilter({ moduleId: section.moduleId, disable: false, isAdminVerified: true }, section)
//     )
//         .sort({ createdAt: -1 })
//         .limit(section.limit)
//         .select('firstName lastName email isProfileCompleted isAdminVerified createdAt')
//         .lean();
// };

//asgar-code
const resolveVENDOR_LIST = async (section) => {
    return VendorProfile.aggregate([
        {
            $match: applySourceFilter(
                { disable: false, isAdminVerified: true },
                section,
            ),
        },

        { $sort: { createdAt: -1 } },
        { $limit: section.limit },

        {
            $lookup: {
                from: "vendorcompanies",
                localField: "_id",
                foreignField: "vendorId",
                as: "company",
            },
        },

        {
            $unwind: {
                path: "$company",
                preserveNullAndEmptyArrays: false, // sirf wahi vendors jinke paas company hai
            },
        },

        {
            $project: {
                _id: 1,

                // vendor basic
                firstName: 1,
                lastName: 1,

                // shop info (frontend me ye hi use hoga)
                shopName: "$company.companyName",
                shopImage: { $arrayElemAt: ["$company.shopImages", 0] },
                city: "$company.businessAddress.city",
                isOpen: "$company.isOpen",
                badges: "$company.badges",
            },
        },
    ]);
};
const resolveBRAND_LIST = async (section) => {
    return Brand.find(
        applySourceFilter(
            { moduleId: section.moduleId, status: "active" },
            section,
        ),
    )
        .sort({ order: 1 })
        .limit(section.limit)
        .select("name logo slug")
        .lean();
};

const resolveFLASH_SALE = async (section) => {
    const now = new Date();

    const activeSale = await FlashSale.findOne({
        moduleId: section.moduleId,
        isCancelled: false,
        startDateTime: { $lte: now },
        endDateTime: { $gte: now },
    })
        .select("_id label startDateTime endDateTime")
        .lean();

    if (!activeSale) return [];

    const items = await FlashSaleItem.find({ flashSaleId: activeSale._id })
        .limit(section.limit)
        .populate("productId", "name thumbnail slug avgRating")
        .populate("variantId", "mrp size Type")
        .lean();

    const enriched = items
        .filter((item) => item.productId && item.variantId)
        .map((item) => ({
            flashItemId: item._id,
            product: item.productId,
            variant: item.variantId,
            originalPrice: item.basePriceSnapshot,
            flashPrice: item.flashPrice,
            discountPercent: item.flashDiscountPercent,
            discountAmount: item.basePriceSnapshot - item.flashPrice,
            remainingStock: Math.max(item.allocatedStock - item.sold, 0),
            soldPercent: Math.max(
                0,
                Math.min(100, Math.round((item.sold / item.allocatedStock) * 100)),
            ),
        }));

    return [
        {
            saleId: activeSale._id,
            saleLabel: activeSale.label,
            endsAt: activeSale.endDateTime,
            startsAt: activeSale.startDateTime,
            items: enriched,
        },
    ];
};

export const sectionResolvers = {
    BANNER: resolveBANNER,
    PRODUCT_LIST: resolvePRODUCT_LIST,
    CATEGORY_LIST: resolveCATEGORY_LIST,
    VENDOR_LIST: resolveVENDOR_LIST,
    BRAND_LIST: resolveBRAND_LIST,
    FLASH_SALE: resolveFLASH_SALE,
};
