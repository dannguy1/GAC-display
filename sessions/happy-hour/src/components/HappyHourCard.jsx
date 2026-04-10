import React, { useState, useRef, useEffect } from 'react';
import { getImageUrl } from '../services/api';
import './HappyHourCard.css';

const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExMjBkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzZXJpZiIgZm9udC1zaXplPSIzMiIgZmlsbD0iI2M2ODkzZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPjwvdGV4dD48L3N2Zz4=';

export default function HappyHourCard({ item }) {
    const [imgSrc, setImgSrc] = useState(getImageUrl(item.image_path) || PLACEHOLDER);
    const videoRef = useRef(null);
    const [videoFailed, setVideoFailed] = useState(false);
    const videoUrl = item.video_path ? getImageUrl(item.video_path) : null;
    const showVideo = videoUrl && !videoFailed;

    // Auto-play video when card mounts or video_path changes
    useEffect(() => {
        if (showVideo && videoRef.current) {
            videoRef.current.play().catch(() => setVideoFailed(true));
        }
    }, [showVideo]);

    return (
        <div className="hh-card">
            <div className="hh-card__media-wrap">
                {showVideo ? (
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        className="hh-card__video"
                        muted
                        loop
                        playsInline
                        onError={() => setVideoFailed(true)}
                    />
                ) : (
                    <img
                        src={imgSrc}
                        alt={item.name}
                        className="hh-card__image"
                        onError={() => setImgSrc(PLACEHOLDER)}
                    />
                )}
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
                    {item.original_price != null && (
                        <span className="hh-card__original">${item.original_price.toFixed(2)}</span>
                    )}
                    <span className="hh-card__price">${(item.price || 0).toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
}
