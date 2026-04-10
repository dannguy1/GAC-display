import React, { useState } from 'react';
import { getImageUrl } from '../services/api';
import './HappyHourCard.css';

const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExMjBkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzZXJpZiIgZm9udC1zaXplPSIzMiIgZmlsbD0iI2M2ODkzZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPjwvdGV4dD48L3N2Zz4=';

export default function HappyHourCard({ item }) {
    const [imgSrc, setImgSrc] = useState(getImageUrl(item.image_path) || PLACEHOLDER);

    return (
        <div className="hh-card">
            <div className="hh-card__image-wrap">
                <img
                    src={imgSrc}
                    alt={item.name}
                    className="hh-card__image"
                    onError={() => setImgSrc(PLACEHOLDER)}
                />
                {item.tag && (
                    <span className="hh-card__tag">{item.tag}</span>
                )}
            </div>
            <div className="hh-card__info">
                <div className="hh-card__category">{item.category}</div>
                <h2 className="hh-card__name">{item.name}</h2>
                {item.description && (
                    <p className="hh-card__desc">{item.description}</p>
                )}
                <div className="hh-card__prices">
                    {item.original_price && (
                        <span className="hh-card__original">${item.original_price.toFixed(2)}</span>
                    )}
                    <span className="hh-card__price">${(item.price || 0).toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
}
