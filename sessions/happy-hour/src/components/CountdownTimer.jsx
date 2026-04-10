import React, { useState, useEffect } from 'react';
import './CountdownTimer.css';

/**
 * Countdown timer that shows time remaining until a target hour:minute.
 * Displays HH:MM:SS format. Shows "Happy Hour has ended" when expired.
 */
export default function CountdownTimer({ endHour, endMinute }) {
    const [remaining, setRemaining] = useState(() => calcRemaining(endHour, endMinute));

    useEffect(() => {
        const id = setInterval(() => {
            setRemaining(calcRemaining(endHour, endMinute));
        }, 1000);
        return () => clearInterval(id);
    }, [endHour, endMinute]);

    if (remaining <= 0) {
        return (
            <div className="countdown countdown--ended">
                <span className="countdown__label">Happy Hour has ended</span>
            </div>
        );
    }

    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;

    return (
        <div className="countdown">
            <span className="countdown__label">Ends in</span>
            <div className="countdown__digits">
                <span className="countdown__segment">
                    <span className="countdown__number">{String(hours).padStart(2, '0')}</span>
                    <span className="countdown__unit">hr</span>
                </span>
                <span className="countdown__colon">:</span>
                <span className="countdown__segment">
                    <span className="countdown__number">{String(minutes).padStart(2, '0')}</span>
                    <span className="countdown__unit">min</span>
                </span>
                <span className="countdown__colon">:</span>
                <span className="countdown__segment">
                    <span className="countdown__number">{String(seconds).padStart(2, '0')}</span>
                    <span className="countdown__unit">sec</span>
                </span>
            </div>
        </div>
    );
}

function calcRemaining(endHour, endMinute) {
    const now = new Date();
    const target = new Date(now);
    target.setHours(endHour, endMinute, 0, 0);
    return Math.max(0, Math.floor((target - now) / 1000));
}
