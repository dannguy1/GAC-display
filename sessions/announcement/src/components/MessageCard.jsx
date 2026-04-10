import React from 'react';
import './MessageCard.css';

const STYLE_LABELS = {
    warning: 'NOTICE',
    promo: 'SPECIAL',
    info: 'ANNOUNCEMENT',
};

export default function MessageCard({ data }) {
    const style = data.style || 'info';

    return (
        <div className={`message-card message-card--${style}`}>
            <div className="message-card__accent" />
            <span className="message-card__label">{STYLE_LABELS[style] || 'ANNOUNCEMENT'}</span>
            <h1 className="message-card__headline">{data.headline}</h1>
            {data.body && (
                <>
                    <div className="message-card__divider" />
                    <p className="message-card__body">{data.body}</p>
                </>
            )}
        </div>
    );
}
