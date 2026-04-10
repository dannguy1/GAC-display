import React, { useState } from 'react';
import { getImageUrl } from '../services/api';
import './MenuItemCard.css';

const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTJkZGQzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzZXJpZiIgZm9udC1zaXplPSIzMiIgZmlsbD0iIzZiNjY2MSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';

export default function MenuItemCard({ item }) {
    const [imgSrc, setImgSrc] = useState(getImageUrl(item.image_path) || PLACEHOLDER);

    return (
        <div className="menu-item-card">
            {/* Left: image */}
            <div className="menu-item-card__image-wrap">
                <img
                    src={imgSrc}
                    alt={item.item_name}
                    className="menu-item-card__image"
                    onError={() => setImgSrc(PLACEHOLDER)}
                />
                {item.popular && (
                    <span className="menu-item-card__badge">POPULAR</span>
                )}
            </div>

            {/* Right: info panel */}
            <div className="menu-item-card__info">
                <div className="menu-item-card__category">{item.category}</div>
                <h1 className="menu-item-card__name">{item.item_name}</h1>
                {item.item_viet && (
                    <p className="menu-item-card__viet">{item.item_viet}</p>
                )}
                <div className="menu-item-card__divider" />
                <p className="menu-item-card__desc">{item.description}</p>
                <div className="menu-item-card__price">${(item.price || 0).toFixed(2)}</div>
            </div>
        </div>
    );
}
