export function getEffectivePrice(
  product: { price: any; wholesalePrice: any },
  role?: string | null
): number {
  if (role === 'wholesale' && product.wholesalePrice != null) {
    return Number(product.wholesalePrice)
  }
  return Number(product.price)
}
