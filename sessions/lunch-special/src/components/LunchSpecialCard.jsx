import React, { useState } from 'react';
import { getImageUrl } from '../services/api';
import './LunchSpecialCard.css';

const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMmMxZjE0Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzZXJpZiIgZm9udC1zaXplPSIzMiIgZmlsbD0iI2M2ODkzZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPjwvdGV4dD48L3N2Zz4=';

export default function LunchSpecialCard({ item }) {
    const [imgSrc, setImgSrc] = useState(getImageUrl(item.image_path) || PLACEHOLDER);

    return (
        <div className="ls-card">
            {/* Left: image */}
            <div className="ls-card__image-wrap">
                <img
                    src={imgSrc}
                    alt={item.item_name}
                    className="ls-card__image"
                    onError={() => setImgSrc(PLACEHOLDER)}
                />
                {item.tag && (
                    <span className="ls-card__tag">{item.tag}</span>
                )}
            </div>

            {/* Right: info panel */}
            <div className="ls-card__info">
                <div className="ls-card__category">{item.category}</div>
                <h1 className="ls-card__name">{item.item_name}</h1>
                {item.item_viet && (
                    <p className="ls-card__viet">{item.item_viet}</p>
                )}
                <div className="ls-card__divider" />
                {item.description && (
                    <p className="ls-card__desc">{item.description}</p>
                )}
                {item.includes && (
                    <p className="ls-card__includes">Includes: {item.includes}</p>
                )}
                <div className="ls-card__prices">
                    {item.original_price != null && (
                        <span className="ls-card__original">${item.original_price.toFixed(2)}</span>
                    )}
                    <span className="ls-card__price">${(item.price || 0).toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
}
