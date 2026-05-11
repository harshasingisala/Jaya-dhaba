import { useApp } from './AppContext';

/**
 * DEPRECATED: useApp() should be used instead.
 * Aliasing for compatibility to ensure 10/10 zero-regression requirement.
 */
export const useCart = () => {
    const app = useApp();
    return {
        ...app,
        addToCart: (product) => app.addToCart(product, 1),
        items: app.cart,
        cartCount: app.cart.reduce((acc, item) => acc + item.qty, 0),
        cartTotal: app.total
    };
};

export const CartProvider = ({ children }) => <>{children}</>;
