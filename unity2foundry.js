class Unity2Foundry {
	static get MODULE_ID() { return "unity2foundry"; }
	
	// Currently evaluated position (VisionSource or LightSource)
	static activePosition = undefined;
}

Hooks.once('setup', () => {			
	libWrapper.register(Unity2Foundry.MODULE_ID, 'VisionSource.prototype.initialize', function(wrapped, data)	{
		Unity2Foundry.activePosition = new PIXI.Point(this.x, this.y);
		let result = wrapped(data);
		Unity2Foundry.activePosition = undefined;
		return result;
	}, 'WRAPPER');
	
	libWrapper.register(Unity2Foundry.MODULE_ID, 'LightSource.prototype.initialize', function(wrapped, data)	{
		Unity2Foundry.activePosition = new PIXI.Point(this.x, this.y);
		let result = wrapped(data);
		Unity2Foundry.activePosition = undefined;
		return result;
	}, 'WRAPPER');
	
	libWrapper.register(Unity2Foundry.MODULE_ID, 'ClockwiseSweepPolygon.prototype._getWalls', function(wrapped) {	
		const staticWalls = wrapped();
		const activePosition = Unity2Foundry.activePosition;
		if (!activePosition)
			return staticWalls;
				
		const dynamicWalls = [];		
		staticWalls.forEach(wall => {
			// is this a wall that uses Unity2Foundry projection?
			const data = wall.data.flags.unity2foundry;
			if (!data)
				return;
			
			// data validation
			let projectA, projectB;
			if (Array.isArray(data.projectA) && data.projectA.length === 2)
				projectA = new PIXI.Point(data.projectA[0], data.projectA[1]);
			if (Array.isArray(data.projectB) && data.projectB.length === 2)
				projectB = new PIXI.Point(data.projectB[0], data.projectB[1]);		
			const limitA = Number(data.limitA);
			const limitB = Number(data.limitB);
			if (!projectA || !projectB || !limitA || !limitB)
				return;
			
			// we only project on invisible walls or open doors
			if (wall.data.sight !== CONST.WALL_SENSE_TYPES.NONE)
			{
				if (wall.data.door === CONST.WALL_DOOR_TYPES.NONE) // not a door
					return;
				if (wall.data.ds !== CONST.WALL_DOOR_STATES.OPEN) // door not open
					return;
			}
			
			// create dynamic projection walls
			const projectWall = function(wallPosition, projectPosition, limitMin, limitMax)
			{
				let resA = wallPosition;
				let resB = projectPosition;
				const wallRay = new Ray(wall.A, wall.B);
				const intersect = foundry.utils.lineLineIntersection(wall.A, wall.B, activePosition, projectPosition);
				if (!intersect)
					return;
				
				// projectPosition and activePosition on the same side of the wall?
				const sideWall = foundry.utils.orient2dFast(wall.A, wall.B, projectPosition);
				const sideVision = foundry.utils.orient2dFast(wall.A, wall.B, activePosition);		
				if ((sideWall > 0) === (sideVision > 0))
				{	
					const t = Math.clamped(intersect.t0, 0.0, 1.0);
					resB = wallRay.project(t);
					
					// standing directly inside the door frame?
					const dot = (resB.x-activePosition.x)*(projectPosition.x-activePosition.x)
							  + (resB.y-activePosition.y)*(projectPosition.y-activePosition.y);
					if (dot < 0) 
						resB = projectPosition;
				}
				else
				{
					const t = Math.clamped(intersect.t0, limitMin, limitMax);
					resB = wallRay.project(t);
				}
				
				// create temporary fake wall
				const doc = new WallDocument(
					{ _id: foundry.utils.randomID(), c: [ resA.x, resA.y, resB.x, resB.y ], light: 20, sight: 20 },
					{ parent: canvas.scene }
				);		
				dynamicWalls.push(new Wall(doc));			
			};
			
			projectWall(wall.A, projectA, 0.0, limitA);
			projectWall(wall.B, projectB, limitB, 1.0);
		});	
				
		if (dynamicWalls.length > 0)
		{
			dynamicWalls.push(...staticWalls);
			return dynamicWalls;
		}
		else
		{
			return staticWalls;
		}
	}, 'WRAPPER');
});

Hooks.once('ready', () => {
    if(!game.modules.get('lib-wrapper')?.active && game.user.isGM)
	{
        ui.notifications.error("Module '" + Unity2Foundry.MODULE_ID + "' requires the 'libWrapper' module. Please install and activate it.");
	}
});